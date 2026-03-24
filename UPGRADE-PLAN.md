# My Workout Tracker - Product and Technical Roadmap

Last updated: March 24, 2026

## Vision

Build a mobile-first fitness companion that connects training, nutrition, and body composition in one fast, reliable app.

## Current State (March 24, 2026)

- Core workout tracking is in production.
- Local-first cache and Firebase usage telemetry are in place.
- App and integration journeys are stable in CI.
- Phase 0.6 hardening is in progress with core reliability milestones delivered.

## Roadmap Format

This roadmap is organized as:

- Now: Active and near-term execution
- Next: Planned future work that is approved but not started
- Later: Feature expansion after hardening gates are met

---

## Now - Complete Phase 0.5 Baseline (in progress)

Goal: Finish Firebase optimization baseline and keep product development stable.

### Workstreams

1. Maintain cache-first reads for routines, history, calendar, and progress.
2. Keep Firebase usage instrumentation active for key read/write paths.
3. Ensure cache invalidation remains correct after session and routine writes.
4. Keep app journey tests passing on pull requests.

### Exit Criteria

- App journey tests pass in CI.
- No regressions in offline retry/recovery flows.
- Firebase usage telemetry remains visible in Settings.

---

## Next - Phase 0.6 Hardening (in progress)

Goal: Introduce a stability-first hardening phase before major lifestyle features.

Target window: start no earlier than April 2026, after current Phase 0.5 work is closed.

### 0.6A: Planning and Reliability Foundations

Milestone update (March 24, 2026):

- Major reliability milestone reached:
  - Session restore contract fixed and made backward-compatible.
  - Durable offline queue support implemented for serializable operations.
  - Settings text encoding issues fixed for Firebase usage labels.
  - Regression tests added for restore flow and persisted offline queue replay.
  - Unit test suites unskipped and stabilized for:
    - Pagination module (`tests/unit/pagination.test.js`)
    - History manager module (`tests/unit/history-manager.test.js`)
    - Session manager module (`tests/unit/session-manager.test.js`)
    - Settings module (`tests/unit/settings.test.js`)
    - Calendar module (`tests/unit/calendar.test.js`)
  - Full local validation run is green via `npm run test:all`:
    - `lint:errors` passed
    - unit and integration suites passed
    - app journey suites passed
    - coverage reached 61.32% (above 60% Phase 0.6A gate)

#### Roadmap cleanup

1. Keep this roadmap synchronized with implementation status.
2. Use explicit "done / planned / deferred" tags on each major item.
3. Keep a single source of truth for current priorities.

#### Reliability fixes

1. Fix version/session restore contract mismatch in version/session flows.
2. Move offline queued operations to a durable queue (IndexedDB-backed), not memory-only.
3. Fix user-facing encoding/text corruption in settings labels and messages.

#### Public interfaces and data contract

1. Add a versioned Firestore data contract document before schema expansion.
2. Keep exported session APIs backward-compatible while fixing restore behavior.
3. Define migration rules for existing Spanish field names vs new schema additions.

#### Test plan

1. [done] Add regression tests for version upgrade + session restore.
2. [done] Add regression tests for offline queue persistence across reload.
3. [done] Unskip and stabilize tests for: history manager, pagination, session manager, settings, calendar.
4. [done] History manager and pagination suites are now unskipped and stable.
5. [done] Session manager, settings, and calendar suites are now unskipped and stable.
6. [done] Logger production-mode cases are now unskipped and stable; unit suites currently have no skipped tests.

#### Quality gates

1. [in progress] Reduce lint warnings in a controlled pass and establish a ratchet policy.
2. [done] Raise total coverage from current baseline (about 51.57%) to at least 60% (currently 61.37%).
3. [done] Keep app-level journey tests as required CI gates.

### 0.6B: Quality Ratchet and Readiness Gate

#### Quality gates

1. Continue lint warning reduction and tighten CI warning budget.
2. Raise total coverage from 60% to at least 70%.
3. Keep all newly unskipped critical suites green.

#### Go/No-Go Criteria for Phase 1

Phase 1 starts only when:

1. 0.6A and 0.6B exit criteria are met.
2. Offline queue durability is verified by automated tests.
3. Data contract documentation is approved for schema expansion.

---

## Later - Feature Expansion (after 0.6 gate)

## Phase 1: Mobile-First UX and Lifestyle Core

Goal: Daily dashboard, quick logging flows, and workout UX improvements.

Planned capabilities:

1. Daily dashboard and quick actions.
2. Weight logging and calorie logging.
3. Goal progress indicators and reminders.
4. Quick start workout mode and improved set input UX.

## Phase 2: Integrated Progress Analytics

Goal: Connect training, nutrition, and body-composition trends.

Planned capabilities:

1. Integrated progress dashboard.
2. Exercise-level trend history and PR highlights.
3. Better filtering and cross-domain insights.

## Phase 3: Smart Insights and Automation

Goal: Deliver actionable, rule-based recommendations.

Planned capabilities:

1. Goal trajectory projections.
2. Nutrition/training alignment insights.
3. Recovery and plateau detection suggestions.

## Phase 4: Optional Social Layer

Goal: Add opt-in sharing and community features.

Planned capabilities:

1. Workout sharing.
2. Friend following.
3. Community challenges and leaderboards.

---

## Delivery Principles

1. Stability before scale: do not add high-data features before hardening is complete.
2. Mobile-first interaction quality: optimize daily logging speed and one-handed use.
3. Incremental quality ratchet: improve lint and coverage by staged gates, not one-time big-bang changes.
4. Backward compatibility first: preserve existing data and flows during migrations.
