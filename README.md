# My Workout Tracker

[![Tests](https://github.com/metalfurius/gym/actions/workflows/test.yml/badge.svg)](https://github.com/metalfurius/gym/actions/workflows/test.yml)
[![Lint](https://github.com/metalfurius/gym/actions/workflows/lint.yml/badge.svg)](https://github.com/metalfurius/gym/actions/workflows/lint.yml)
[![CodeQL](https://github.com/metalfurius/gym/actions/workflows/codeql.yml/badge.svg)](https://github.com/metalfurius/gym/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/metalfurius/gym/branch/main/graph/badge.svg)](https://codecov.io/gh/metalfurius/gym)

A modern, responsive workout tracking web app with session management, routine customization, and progress visualization.

## Features

- Comprehensive workout management (routines, sessions, history)
- Multiple views: Dashboard, Session, History, Routine Management, Progress
- Dashboard Daily Hub with quick today stats and sync status
- Weekly consistency streaks in Daily Hub (current streak, best streak, this-week progress)
- Cloud-synced weekly target preference (`app_data/user_preferences`) with offline replay
- Quick Log flow for sub-30s lightweight workout entries
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

## Local Preview

Run a local static server from the project root:

```bash
npm run serve
```

Then open:

- `http://localhost:8080`

## Technical Features

- Firebase Authentication and Firestore database
- Service Worker for offline/static asset caching
- Modular JS and CSS architecture
- Browser storage for in-progress session persistence
- Local-first cache layer (IndexedDB with localStorage fallback)
- Firebase read/write telemetry in the Settings modal

## Roadmap and Quality Policy

Planning docs:

- [CONTRIBUTING.md](CONTRIBUTING.md) - PR-first contribution workflow and major-feature lifecycle policy
- [UPGRADE-PLAN.md](UPGRADE-PLAN.md) - single source of truth for the 6-week roadmap
- [TESTING-PLAN.md](TESTING-PLAN.md) - testing policy and enforcement rules
- [docs/quick-log-daily-hub-readiness.md](docs/quick-log-daily-hub-readiness.md) - acceptance criteria and rollout checklist for the first feature/fun slice
- [docs/exercise-execution-mode-plan.md](docs/exercise-execution-mode-plan.md) - post-cycle plan for one-hand/two-hand/machine/pulley execution modes
- [docs/session-variants-i18n-plan.md](docs/session-variants-i18n-plan.md) - implemented milestone spec for per-session mode/load overrides plus ES/EN language system
- [docs/weekly-consistency-streaks-plan.md](docs/weekly-consistency-streaks-plan.md) - implemented milestone spec for custom weekly consistency streaks (v1)
- [docs/read-optimized-weekly-consistency-plan.md](docs/read-optimized-weekly-consistency-plan.md) - next-phase major-feature spec for reducing weekly consistency read cost
- [docs/commit-versioning.md](docs/commit-versioning.md) - commit keyword rules that drive automatic `major` / `minor` / `patch` bumps

### Current Focus (March 30, 2026 to May 10, 2026)

- Dual-track strategy with hard quality gates
- Execution split: Stability 45%, Foundation 35%, Feature/Fun 20%
- Feature/Fun milestones delivered: `Quick Log + Daily Hub`, `Session-Time Exercise Variants`, `ES/EN Language System`, `Custom Weekly Consistency Streaks (v1)`
- Current major feature status: `Custom Weekly Consistency Streaks (v1)` implemented on PR `#75` branch and pending merge to `main`

### Hard Gates for This Cycle

- `npm run lint:ratchet` (zero-warning policy)
- `npm run test:app` (app journeys required)
- `npm run test:app:offline` (offline recovery/retry required)
- `npm run test:no-skips` (no `.skip` / `xit` / `xdescribe`)
- Staged coverage ratchet in the roadmap: Week 2 >= 64%, Week 4 >= 67%, Week 6 >= 70%
- Feature/fun lane freeze whenever a hard gate fails

### Next Phase

Current feature/fun implementation targets delivered: `Quick Log + Daily Hub`, `Exercise Execution Modes`, `Session-Time Exercise Variants + ES/EN Language System`, `Custom Weekly Consistency Streaks (v1)`.
Next target: `Read-Optimized Weekly Consistency (v1.1)` with local-first streak computation and reduced Firestore reads.

### How We Ship Major Features

- Use one long-lived draft PR per major feature until merge-safe.
- Track PR stage as `Draft` -> `In Progress` -> `Merge Candidate`.
- Keep dependency/maintenance PRs separate from major feature PRs.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full workflow and gate rules.

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
- `npm run build:check` (release revision, cache manifest, and two-build integrity)
- `npm run release:check` (same release contract check used by CI and release automation)
- `npm run test:e2e:upgrade` (real Chromium old-to-new update, offline recovery, and visual evidence)
- `npm run test:e2e:upgrade:firefox` (real Firefox old-to-new update, offline recovery, accessibility, and visual evidence)
- `npm run production:release:smoke` (no-query production metadata, cache headers, and every declared asset hash)

### Release and update contract

Every release has one revision, `vX.Y.Z`, recorded in `manifest.json`, `release.json`,
the shell metadata, and `sw.js`. The service worker precaches a complete revision-scoped
asset set before it can activate. Release metadata is fetched network-first and the deployed
`_headers` policy documents the no-store intent for canonical metadata. GitHub Pages still emits
its own cache headers, so `.github/workflows/cloudflare-cache.yml` runs after the Pages deployment,
validates the restricted production purge token without printing it, purges the canonical no-query
URLs and declared asset set, and verifies the deployed hashes before the release is considered ready.

An installed client activates a waiting worker through `SKIP_WAITING`, backs up the in-progress
workout, reloads after `controllerchange`, and restores the session from local storage. Old
revision caches are deleted only from the new worker's activation after its precache succeeds.

Run `npm run release:check` before publishing. The check verifies metadata agreement, every
cached local asset and SHA-256 hash, shell references, and two consecutive deterministic build
revisions without query-string cache busting.
