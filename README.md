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

## Roadmap

See [UPGRADE-PLAN.md](UPGRADE-PLAN.md) for the full multi-phase roadmap.

### Current Focus: Phase 0.5 Firebase Optimization

- Cache-first loading for routines/history/calendar/progress fallback
- Usage tracking for Firebase reads/writes and high-cost operations
- Smarter cache invalidation after session and routine writes
- Throttled exercise-cache integrity checks to cut repeated reads

### Next Planned Phase (Future): Phase 0.6 Hardening

- Stability-first hardening before major lifestyle feature expansion
- Reliability fixes for session restore and offline queued operations
- Quality ratchet for lint debt, skipped critical tests, and staged coverage goals

### Later

- Flexible workout mode (muscle-group first sessions)
- Weight and nutrition logging
- Goal tracking and integrated insights

## License and Copyright

© [metalfurius] 2025. All Rights Reserved.

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
- `npm run test:app` (runs ESLint errors check first, then app journeys)
- `npm run test:app:only` (app journeys only, no lint gate)
- `npm run test:coverage`
- `npm run lint:errors` (errors-only ESLint gate)

CI (`.github/workflows/test.yml`) runs `npm run test:app` before coverage on PRs and `main` pushes.

