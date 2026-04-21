# Session-Time Exercise Variants + ES/EN Language System Plan

Last updated: April 21, 2026  
Status: Implemented (Phase 1 + Phase 2 delivered)

## Purpose

Define the milestone that followed Exercise Execution Modes:

1. Let users choose strength exercise `executionMode` and `loadType` during each session.
2. Add a complete ES/EN language system and remove mixed-language copy.

## Scope

In scope:

1. Session-time overrides for `executionMode` and `loadType` on each strength exercise.
2. Override precedence rule: in-progress session value > local override > routine default.
3. Local persistence for overrides by user + routine + exercise identity.
4. ES/EN i18n foundation with a header selector and centralized dictionaries.
5. Copy unification for static UI text and runtime strings (toasts, confirms, placeholders, labels).

Out of scope:

1. Firestore schema changes.
2. Cross-device sync of override preferences.
3. Automatic update of routine defaults when users change session-time variants.

## Locked Product Decisions

1. Language support in this milestone is limited to `es` and `en`.
2. Language selector is placed in the header (next to global controls).
3. Session-time variant changes are remembered for next sessions.
4. Remembered variant storage is local (device-level), not cloud-synced.
5. Routine defaults remain baseline defaults and are not auto-mutated by session overrides.

## Functional Specification

### A) Session-Time Variant Overrides

1. Strength exercises in Session view expose variant controls:
   - `executionMode`: `one_hand`, `two_hand`, `machine`, `pulley`, `other`
   - `loadType`: `external`, `bodyweight`
2. Initial value resolution per exercise follows this strict order:
   1. In-progress session snapshot (if present),
   2. Local remembered override (same user + routine + exercise),
   3. Routine default.
3. Saving a session writes the effective per-session values in existing session fields:
   - `modoEjecucion`
   - `tipoCarga`

### B) Local Override Persistence

1. Override memory is stored locally per user.
2. Keying strategy must include routine and exercise identity to avoid collisions.
3. Persistence layer is local only and not part of Firestore wire data.

### C) ES/EN Language System

1. Introduce centralized translation dictionaries for `es` and `en`.
2. Replace hardcoded mixed-language copy across:
   - static labels/titles/buttons,
   - runtime strings (toasts/confirmations/placeholders/dynamic labels).
3. Persist selected language locally and apply it at app startup.
4. Theme system and language system remain independent concerns.

## Contract and Compatibility Notes

1. No public API changes and no new Firestore fields in this milestone.
2. Existing backward-compat rules remain valid for legacy documents.
3. Session fields `modoEjecucion`/`tipoCarga` continue as canonical session execution descriptors.
4. Local override memory is intentionally outside the cloud data contract.

## Validation Gates (Implementation Record)

1. `npm run lint:ratchet`
2. `npm run test:app`
3. `npm run test:app:offline`
4. Manual QA in both languages (`es`, `en`) and all themes:
   - selector behavior and persistence,
   - text consistency (no mixed-language leftovers),
   - session override precedence and saved values,
   - offline/replay behavior unchanged.
