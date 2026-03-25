# Firestore Data Contract (Draft)

Last updated: March 25, 2026
Status: Draft for review

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

## Compatibility and Migration Constraints

1. No destructive migration in place for this cycle.
2. Existing documents must remain readable without backfill.
3. Write paths that touch session persistence must preserve compatibility with offline queue replay.
4. Contract changes require matching updates in:
- `js/modules/session-manager.js`
- `js/progress.js`
- `js/utils/firestore-serialization.js`

