# Firestore Data Contract

Last updated: April 23, 2026
Status: Active

## Purpose

This document defines the current Firestore wire contract used by the app and the compatibility rules for future schema evolution.

## Collections and Documents

### 1) User routines

Path: `users/{uid}/routines/{routineId}`

Current document shape:

```json
{
  "name": "Push Day",
  "exercises": [
    {
      "name": "Bench Press",
      "type": "strength",
      "executionMode": "one_hand",
      "sets": 4,
      "reps": "8-10",
      "duration": "",
      "notes": ""
    }
  ],
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

Required fields:

- `name` (string)
- `exercises` (array, can be empty for draft routines)

Optional per-exercise fields:

- `executionMode` for strength exercises

Server-managed/client-set timestamps:

- `createdAt`
- `updatedAt`

### 2) Training sessions

Path: `users/{uid}/sesiones_entrenamiento/{sessionId}`

Current document shape:

```json
{
  "fecha": "<Firestore Timestamp>",
  "routineId": "routine-id",
  "nombreEntrenamiento": "Push Day",
  "userId": "uid",
  "ejercicios": [
    {
      "nombreEjercicio": "Bench Press",
      "tipoEjercicio": "strength",
      "modoEjecucion": "one_hand",
      "tipoCarga": "external",
      "objetivoSets": 4,
      "objetivoReps": "8-10",
      "objetivoDuracion": "",
      "sets": [
        {
          "peso": 80,
          "reps": 8,
          "tiempoDescanso": "01:30"
        }
      ],
      "notasEjercicio": ""
    }
  ],
  "pesoUsuario": 75.4
}
```

Required fields:

- `fecha`
- `routineId`
- `nombreEntrenamiento`
- `userId`
- `ejercicios` (array)

Optional fields:

- `pesoUsuario` (number or `null`)
- `notasEjercicio` per exercise
- `objetivo*` fields for session context
- `modoEjecucion` for strength exercises
- `tipoCarga` for strength exercises (`external`, `bodyweight`)

### 3) App backup data

Path: `users/{uid}/app_data/exercise_cache`

Current document shape:

```json
{
  "cache": {
    "bench_press": {
      "originalName": "Bench Press",
      "history": [
        {
          "date": "2026-03-25T10:00:00.000Z",
          "timestamp": 1774432800000,
          "sets": [
            { "peso": 80, "reps": 8 }
          ]
        }
      ]
    }
  },
  "lastSync": "2026-03-25T10:00:00.000Z",
  "version": "1.0"
}
```

### 4) User preferences

Path: `users/{uid}/app_data/user_preferences`

Current document shape:

```json
{
  "weeklyTargetDays": 3,
  "weeklyTargetsByWeek": {
    "2026-04-20": {
      "targetDays": 3,
      "savesUsed": 1,
      "updatedAtIso": "2026-04-22T10:00:00.000Z"
    }
  },
  "weeklyOutcomesByWeek": {
    "2026-04-13": {
      "targetDays": 3,
      "activeDays": 2,
      "met": false,
      "lockedAtIso": "2026-04-22T10:00:00.000Z"
    }
  },
  "schemaVersion": 2,
  "updatedAt": "<Firestore Timestamp>"
}
```

Fields:

- `weeklyTargetDays` (integer, clamped to `1..7`, default fallback `3`)
- `weeklyTargetsByWeek` (object map keyed by `YYYY-MM-DD` week start, storing `targetDays`, `savesUsed`, `updatedAtIso`)
- `weeklyOutcomesByWeek` (object map keyed by `YYYY-MM-DD` week start, storing frozen `targetDays`, `activeDays`, `met`, `lockedAtIso`)
- `schemaVersion` (integer, currently `2`)
- `updatedAt` (`Timestamp`)

## Versioning Rules

Short term (current code):

- Documents may not yet include explicit `schemaVersion`.
- Readers must continue handling legacy variants (`nombreEjercicio`, `name`, or `ejercicio`) where code already supports them.

Forward rule for schema evolution:

- New writes SHOULD include `schemaVersion` (integer) once the writer path is updated.
- Reader path MUST remain backward-compatible with versionless documents.
- Existing Spanish field names remain valid for reads during migration windows.

## Legacy Field Mapping

Use this mapping when normalizing records for app use:

- Session title:
- Canonical: `nombreEntrenamiento`
- Legacy fallback: `diaEntrenamiento`, then `dia`

- Exercise name:
- Canonical: `nombreEjercicio`
- Legacy fallback: `name`, then `ejercicio`

- Session date:
- Canonical: `fecha` (`Timestamp`)
- Offline queue payload fallback: `fechaIso` (ISO string, rehydrated to `Timestamp`)

## Implemented Extension: Execution Mode (March 29, 2026)

Execution mode for strength exercises is now implemented:

1. Routine exercises (`users/{uid}/routines/{routineId}`): optional field `executionMode` with values `one_hand`, `two_hand`, `machine`, `pulley`, `other`.
2. Session exercises (`users/{uid}/sesiones_entrenamiento/{sessionId}`): optional field `modoEjecucion` (currently mirrored from routine defaults).
3. Backward compatibility rule: if execution mode is absent, consumers treat it as `other`; existing `type` / `tipoEjercicio` semantics remain unchanged.

## Implemented Milestone Alignment: Session-Time Variants + ES/EN

This milestone is implemented. Contract implications:

1. No schema change was required for ES/EN language support.
2. Session fields `modoEjecucion` and `tipoCarga` are canonical descriptors for effective per-session execution behavior.
3. Remembered per-routine/per-exercise variant preferences remain local device state (outside Firestore).

## Implemented Milestone Alignment: Weekly Consistency Streaks

Contract implications:

1. Weekly streak computation reads from existing sessions (`sesiones_entrenamiento`) and does not mutate session schema.
2. User-specific target preference is cloud-synced in `app_data/user_preferences`.
3. Preference writes must remain compatible with offline queue/replay.

## Compatibility and Migration Constraints

1. No destructive migration in place for this cycle.
2. Existing documents must remain readable without backfill.
3. Write paths that touch session persistence must preserve compatibility with offline queue replay.
4. Preference writes under `app_data/user_preferences` must preserve backward-compatible fallback behavior (missing doc -> default `3`).
5. Contract changes require matching updates in:
- `js/modules/session-manager.js`
- `js/progress.js`
- `js/utils/firestore-serialization.js`
