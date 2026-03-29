# Exercise Execution Mode Plan

Last updated: March 29, 2026
Status: Planned (not implemented)
Target window: Post-cycle implementation start (after May 10, 2026)

## Purpose

Define the next feature slice after Quick Log + Daily Hub: differentiating how strength exercises are performed (one-hand, two-hand, machine, pulley).

## Scope (v1)

In scope:

1. Add execution mode as a structured dimension for strength exercises.
2. Persist routine defaults and mirror them into saved session exercises.
3. Show execution mode badges in session detail/history rendering.
4. Keep backward compatibility with legacy records.

Out of scope:

1. New navigation/views.
2. Progress/history/calendar filtering by execution mode.
3. Destructive migration/backfill of old documents.

## Interface and Data Contract Changes

1. Routine exercise object (`users/{uid}/routines/{routineId}`):
   - optional field: `executionMode`
   - allowed values: `one_hand`, `two_hand`, `machine`, `pulley`, `other`
2. Session exercise object (`users/{uid}/sesiones_entrenamiento/{sessionId}`):
   - optional field: `modoEjecucion`
   - mirrored from routine execution mode at save time
3. Compatibility defaults:
   - if execution mode is missing, treat as `other`
   - keep `type`/`tipoEjercicio` behavior unchanged (`strength`/`cardio`)

## UX Behavior (v1)

1. Routine editor shows execution mode selector only when exercise type is `strength`.
2. Labels remain Spanish-first:
   - `Una mano`
   - `Dos manos`
   - `Maquina`
   - `Polea`
   - `Otro`
3. Session detail/history cards show an execution mode badge when present.

## Save and Offline Behavior

1. Session payload generation includes `modoEjecucion` for strength entries.
2. Offline queue/replay preserves this field without changing retry/recovery behavior.
3. Serialization/deserialization accepts canonical and fallback keys for compatibility.

## Test Plan

1. Unit tests:
   - routine editor parsing/persistence of `executionMode`
   - session payload includes `modoEjecucion`
   - fallback/default behavior (`missing -> other`)
2. Integration/app-journey tests:
   - create/edit routines with each execution mode
   - online and offline-replay session save preserving execution mode
   - session detail rendering for execution mode badges
3. Regression gates (must remain green):
   - `npm run lint:ratchet`
   - `npm run test:app`
   - `npm run test:app:offline`
   - `npm run test:coverage:gate`
   - `npm run test:no-skips`

## Delivery Order

1. Quick Log + Daily Hub (already prioritized as first implementation slice).
2. Exercise Execution Modes as the next focused feature PR.
