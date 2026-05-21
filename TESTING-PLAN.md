# Testing Policy and Enforcement Plan

Last updated: May 21, 2026

## Purpose

This document defines testing policy and enforcement rules for post-cycle stabilization and feature work.
It is policy-first by design; detailed test inventory remains in `tests/README.md`.

## Deterministic PR Merge Contract

Every PR to `main` uses one canonical required status check: `merge-ready`.

`merge-ready` passes only when:

1. `quality` gates succeed.
2. `security` CodeQL analysis succeeds.
3. The final `merge-ready` aggregator confirms both jobs succeeded.

Merge approval also requires:

1. All PR conversations resolved.
2. Branch up to date with `main`.

## Hard Quality and Security Gates

These gates are required by the merge contract:

1. `npm run lint:ratchet` (zero warnings)
2. `npm run format:check` (no formatting drift)
3. `npm run test:app` (lint errors gate + app journeys)
4. `npm run test:app:offline` (offline recovery/retry journeys)
5. No new skipped tests (`.skip`, `xit`, `xdescribe`)
6. `npm run test:coverage:gate` meeting the active staged threshold
7. CodeQL JavaScript analysis with `security-extended` queries
8. Read-usage regression coverage when Daily Hub/Firestore read paths change

## Staged Coverage Thresholds

- Week 1 (March 30 to April 5): baseline tracking, no new threshold
- Week 2 (April 6 to April 12): >= 64%
- Week 3 (April 13 to April 19): >= 64% (hold)
- Week 4 (April 20 to April 26): >= 67%
- Week 5 (April 27 to May 3): >= 67% (hold)
- Week 6 (May 4 to May 10): >= 70%

## Required Checks Per Pull Request

Every PR must meet all of the following:

1. `merge-ready` is green on the latest commit.
2. Tests are updated for changed behavior in touched areas.
3. If session/version/offline flows are touched, related regression tests are included or updated.
4. Documentation is kept consistent when plan or policy behavior changes.
5. PR conversations are resolved and branch is up to date with `main`.

## Required Checks Per Release Candidate

A release candidate requires:

1. All PR-level requirements.
2. `npm run test:all` passes in release validation.
3. Coverage meets the active staged gate.
4. No unresolved hard-gate failures in the release branch.

## Freeze Rule

If any hard quality gate fails on PR or `main`:

1. Pause feature/fun lane merges.
2. Allow only stabilization and test/doc recovery work.
3. Resume feature/fun lane only after hard gates return green.

## Command Reference

- `npm run merge:ready:local`
- `npm run lint:ratchet`
- `npm run format:check`
- `npm run test:app`
- `npm run test:app:offline`
- `npm run test:coverage`
- `npm run test:coverage:gate`
- `npm run test:no-skips`
- `npm run test:all`

## Emergency Admin Bypass (Hotfix Only)

- Admin bypass or direct push to `main` is hotfix-only.
- Run `npm run merge:ready:local` before bypass when possible.
- Open a follow-up PR immediately after bypass to restore the normal merge contract record.
