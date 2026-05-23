# My Workout Tracker - Product and Technical Roadmap

Last updated: May 23, 2026

## Purpose

This file is the single source of truth for product and technical priorities.
The March-May stabilization cycle is closed. This document now tracks completed milestones plus the active post-cycle stabilization and v1.1 optimization work.

## Current Baseline (verified May 21, 2026)

- [done] `npm run lint:errors` passes.
- [done] `npm run test:no-skips` passes.
- [done] Unit test suite passes locally.
- [done] `npm run test:app:offline` passes after weekly-target replay timestamp hardening.
- [done] `npm run test:app:only` passes with Daily Hub repeated-refresh read verification.
- [done] `npm run coverage:gate` passes at >= 70% statements coverage.
- [active] `format:check` is becoming a blocking merge gate through the deterministic `merge-ready` contract.

## Completed Six-Week Strategy (March 30, 2026 to May 10, 2026)

Execution split:

- Stability: 45%
- Foundation: 35%
- Feature/Fun: 20%

### Track 1 - Stability (45%)

- [done] Zero-warning lint baseline with CI ratchet (`npm run lint:ratchet`).
- [done] App journey gate in CI (`npm run test:app` before coverage).
- [done] No-skipped-tests gate is enforced (`npm run test:no-skips`).
- [done] Keep offline retry/recovery flows green on every PR (`npm run test:app:offline` in CI).
- [done] Resolve remaining user-facing text encoding regressions in app copy (`js/app.js`).
- [deferred] Expand cross-browser matrix beyond current manual checks.

### Track 2 - Foundation (35%)

- [done] Publish versioned Firestore data contract documentation (`docs/firestore-data-contract.md`).
- [done] Define migration rules for legacy Spanish field names and backward compatibility.
- [done] Document compatibility boundaries for session/version/offline serialization paths.
- [deferred] Begin schema expansion for nutrition and goal domains (after this cycle).

### Track 3 - Feature/Fun (20%)

- [done] Prioritize "Quick Log + Daily Hub" as the first feature/fun slice after hard gates stay green.
- [done] Define acceptance criteria and rollout readiness for this slice (`docs/quick-log-daily-hub-readiness.md`).
- [done] Implement "Quick Log + Daily Hub" dashboard slice with offline replay and reliability coverage.
- [done] Implement "Exercise Execution Modes" (one-hand/two-hand/machine/pulley) for strength exercises (`docs/exercise-execution-mode-plan.md`).
- [done] Implement "Session-Time Exercise Variants + ES/EN Language System" (`docs/session-variants-i18n-plan.md`).
  Delivered: session-time mode/load overrides, local variant memory, header ES/EN selector, unified runtime/static copy.
- [done] Implement "Custom Weekly Consistency Streaks" (`docs/weekly-consistency-streaks-plan.md`).
  Delivered scope: Monday-based weekly streak model, distinct active-day counting, rolling 52-week current/best streak, this-week progress card, cloud-synced weekly target (`users/{uid}/app_data/user_preferences`) with offline queue replay, plus timestamp consistency and bounded query hardening from review.
- [deferred] Streaks/challenges/social mechanics until after this cycle gates are met.

## Weekly Milestones and Quality Gates

### Week 1 (March 30 to April 5)

- Lock documentation baseline across roadmap and testing policy.
- Confirm all hard gates are green in CI and locally.
- Go/No-Go: no feature implementation starts if any hard gate is red.

### Week 2 (April 6 to April 12)

- Coverage gate target: >= 64%.
- Keep zero-warning lint and app journey gates green.
- Go/No-Go: if coverage or hard gates fail, freeze feature lane and run stabilization only.

### Week 3 (April 13 to April 19)

- Deliver data contract draft and migration rule draft for review.
- Keep hard gates green.
- Go/No-Go: no schema-expansion work without approved draft artifacts.

### Week 4 (April 20 to April 26)

- Coverage gate target: >= 67%.
- Revalidate backward-compatibility assumptions in docs.
- Go/No-Go: feature lane stays frozen until gates recover.

### Week 5 (April 27 to May 3)

- Finalize Quick Log + Daily Hub implementation readiness checklist (completed early on March 25, 2026; see `docs/quick-log-daily-hub-readiness.md`).
- Confirm no contradictions between completed and planned hardening items.
- Go/No-Go: if any gate is red, continue hardening only.

### Week 6 (May 4 to May 10)

- Coverage gate target: >= 70%.
- Final readiness review for post-cycle implementation.
- Lock post-cycle feature order for remaining feature work after implemented Execution Modes.
- Go/No-Go: proceed to implementation phase only if all exit criteria are met.

## Post-Cycle Prioritized Feature Queue (starting May 11, 2026)

1. Stabilize merge readiness: deterministic `merge-ready`, blocking format check, weekly replay timestamp preservation, and documentation alignment.
2. Implement "Read-Optimized Weekly Consistency (v1.1)" (`docs/read-optimized-weekly-consistency-plan.md`) to reduce repeated Daily Hub Firestore reads via local-first session caching and bounded sync strategy.
3. Handle Dependabot maintenance PRs separately from feature work (`#67` dev dependencies, `#70` GitHub Actions).
4. Refactor Daily Hub, Quick Log, and weekly consistency module responsibilities so shared streak logic no longer lives under Quick Log utilities.
5. Refresh Feature/Fun backlog after v1.1 validation.
6. Size streaks/challenges/social mechanics discovery after gates remain green.

## Hard Exit Criteria for Post-Cycle Implementation

All criteria are required:

1. `npm run lint:ratchet` remains green.
2. `npm run test:app` remains green.
3. Coverage reaches and holds >= 70%.
4. Data contract and migration rules are documented and approved.
5. No unresolved contradiction remains between `done`, `planned`, and `deferred` items.

## Freeze Rule (applies to whole cycle)

If any hard quality gate fails on PR or `main`:

1. Pause feature/fun lane merges.
2. Allow only stabilization and test/doc recovery work.
3. Resume feature/fun lane only after hard gates return green.
