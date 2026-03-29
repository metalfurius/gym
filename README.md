# My Workout Tracker

[![Tests](https://github.com/metalfurius/gym/actions/workflows/test.yml/badge.svg)](https://github.com/metalfurius/gym/actions/workflows/test.yml)
[![Lint](https://github.com/metalfurius/gym/actions/workflows/lint.yml/badge.svg)](https://github.com/metalfurius/gym/actions/workflows/lint.yml)
[![CodeQL](https://github.com/metalfurius/gym/actions/workflows/codeql.yml/badge.svg)](https://github.com/metalfurius/gym/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/metalfurius/gym/branch/main/graph/badge.svg)](https://codecov.io/gh/metalfurius/gym)

A modern, responsive workout tracking web app with session management, routine customization, and progress visualization.

## Features

- Comprehensive workout management (routines, sessions, history)
- Multiple views: Dashboard, Session, History, Routine Management, Progress
- Activity calendar for monthly workout consistency
- Exercise progress charts with cached historical data
- Strength exercise execution modes (`one_hand`, `two_hand`, `machine`, `pulley`, `other`)
- User authentication with Firebase Auth
- Responsive mobile-friendly interface
- Session continuity for in-progress workouts
- Local-first data optimizations to reduce repeated Firestore reads

## Usage

1. Register or log in.
2. Select a routine.
3. Track sets/reps during your workout.
4. Save the session.
5. Review history and progress charts.

## Technical Features

- Firebase Authentication and Firestore database
- Service Worker for offline/static asset caching
- Modular JS and CSS architecture
- Browser storage for in-progress session persistence
- Local-first cache layer (IndexedDB with localStorage fallback)
- Firebase read/write telemetry in the Settings modal

## Roadmap and Quality Policy

Planning docs:

- [UPGRADE-PLAN.md](UPGRADE-PLAN.md) - single source of truth for the 6-week roadmap
- [TESTING-PLAN.md](TESTING-PLAN.md) - testing policy and enforcement rules
- [docs/quick-log-daily-hub-readiness.md](docs/quick-log-daily-hub-readiness.md) - acceptance criteria and rollout checklist for the first feature/fun slice
- [docs/exercise-execution-mode-plan.md](docs/exercise-execution-mode-plan.md) - post-cycle plan for one-hand/two-hand/machine/pulley execution modes

### Current Focus (March 30, 2026 to May 10, 2026)

- Dual-track strategy with hard quality gates
- Execution split: Stability 45%, Foundation 35%, Feature/Fun 20%
- Feature/Fun priority for the cycle: Quick Log + Daily Hub readiness

### Hard Gates for This Cycle

- `npm run lint:ratchet` (zero-warning policy)
- `npm run test:app` (app journeys required)
- `npm run test:app:offline` (offline recovery/retry required)
- `npm run test:no-skips` (no `.skip` / `xit` / `xdescribe`)
- Staged coverage ratchet in the roadmap: Week 2 >= 64%, Week 4 >= 67%, Week 6 >= 70%
- Feature/fun lane freeze whenever a hard gate fails

### Next Phase

Implementation work starts after all Week 6 exit criteria in `UPGRADE-PLAN.md` are met.
Current feature/fun implementation target: `Quick Log + Daily Hub` (execution modes are already implemented).

## License and Copyright

(c) [metalfurius] 2025. All Rights Reserved.

This project is licensed for personal and educational use only.

### Restrictions

- Commercial use is prohibited without explicit permission
- Redistribution of source or binary forms is not permitted without prior written consent
- Derivative works are not permitted without prior written consent

### Permissions

- Personal use
- Educational use
- Non-commercial research and development

## Acknowledgments

- Firebase for authentication and database services
- Service Worker for offline capabilities

## Testing

- Unit tests: `tests/unit/*.test.js`
- Integration tests: `tests/integration/*.test.js`
- App-level automated journeys:
  - `tests/integration/app-user-journey.test.js`
  - `tests/integration/app-auth-navigation.test.js`
  - `tests/integration/app-offline-recovery.test.js`
  - `tests/integration/app-offline-retry.test.js`
- Manual browser checks: `tests/manual/*`

Commands:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:app`
- `npm run test:app:offline`
- `npm run test:app:only`
- `npm run test:coverage`
- `npm run test:coverage:gate`
- `npm run test:no-skips`
- `npm run test:all`
- `npm run lint`
- `npm run lint:ratchet`
- `npm run lint:errors`
