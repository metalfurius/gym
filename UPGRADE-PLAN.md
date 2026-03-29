# My Workout Tracker - Product and Technical Roadmap

Last updated: March 29, 2026

## Purpose

This file is the single source of truth for product and technical priorities.
Execution has started. This document is kept synchronized with completed implementation milestones.

## Current Baseline (verified March 29, 2026)

- [done] `npm run lint:ratchet` passes (zero warnings).
- [done] `npm run test:app` passes (app journey suites green).
- [done] `npm run test:coverage:gate` passes at 67.50% statements coverage.
- [done] 650 automated tests pass locally.
- [done] Staged coverage ratchet is enforced by tooling (`scripts/coverage-gate.mjs` + CI workflow).

## Six-Week Strategy (March 30, 2026 to May 10, 2026)

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

1. Feature/Fun backlog refresh after Quick Log + Daily Hub implementation review.
2. Streaks/challenges/social mechanics discovery and sizing.

## Hard Exit Criteria for Post-Cycle Implementation

All criteria are required:

1. `npm run lint:ratchet` remains green.
2. `npm run test:app` remains green.
3. Coverage reaches and holds >= 70% at end of Week 6.
4. Data contract and migration rules are documented and approved.
5. No unresolved contradiction remains between `done`, `planned`, and `deferred` items.

## Freeze Rule (applies to whole cycle)

If any hard quality gate fails on PR or `main`:

1. Pause feature/fun lane merges.
2. Allow only stabilization and test/doc recovery work.
3. Resume feature/fun lane only after hard gates return green.
