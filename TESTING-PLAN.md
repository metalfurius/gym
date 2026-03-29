# Testing Policy and Enforcement Plan

Last updated: March 25, 2026

## Purpose

This document defines testing policy and enforcement rules for the 6-week stabilization cycle (March 30, 2026 to May 10, 2026).
It is policy-first by design; detailed test inventory remains in `tests/README.md`.

## Hard Quality Gates

These gates are required for both PR and `main` validation:

1. `npm run lint:ratchet` (zero warnings)
2. `npm run test:app` (lint errors gate + app journeys)
3. `npm run test:app:offline` (offline recovery/retry journeys)
4. `npm run test:coverage:gate` meeting the active staged threshold
5. No new skipped tests (`.skip`, `xit`, `xdescribe`)

## Staged Coverage Thresholds

- Week 1 (March 30 to April 5): baseline tracking, no new threshold
- Week 2 (April 6 to April 12): >= 64%
- Week 3 (April 13 to April 19): >= 64% (hold)
- Week 4 (April 20 to April 26): >= 67%
- Week 5 (April 27 to May 3): >= 67% (hold)
- Week 6 (May 4 to May 10): >= 70%

## Required Checks Per Pull Request

Every PR must meet all of the following:

1. Hard quality gates are green.
2. Tests are updated for changed behavior in touched areas.
3. Offline reliability gate remains green (`npm run test:app:offline`) and is required on PR checks.
4. If session/version/offline flows are touched, related regression tests are included or updated.
5. Documentation is kept consistent when plan or policy behavior changes.

## Required Checks Per Release Candidate

A release candidate requires:

1. All PR-level requirements.
2. `npm run test:all` passes in release validation.
3. Coverage meets the active staged gate for the release week.
4. No unresolved hard-gate failures in the current cycle.

## Freeze Rule

If any hard quality gate fails on PR or `main`:

1. Pause feature/fun lane merges.
2. Allow only stabilization and test/doc recovery work.
3. Resume feature/fun lane only after hard gates return green.

## Command Reference

- `npm run lint:ratchet`
- `npm run test:app`
- `npm run test:app:offline`
- `npm run test:coverage`
- `npm run test:coverage:gate`
- `npm run test:no-skips`
- `npm run test:all`
