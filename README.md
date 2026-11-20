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

To copy routines between accounts, open **Manage my routines**, export them to the clipboard, and paste that JSON into
**Import routines** while signed in. Imports require a connection and create new copies, so importing the same JSON
again creates duplicates. Training sessions are not part of the routine export.

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
- [UPGRADE-PLAN.md](UPGRADE-PLAN.md) - single source of truth for the product and technical roadmap
- [TESTING-PLAN.md](TESTING-PLAN.md) - testing policy and enforcement rules
- [docs/quick-log-daily-hub-readiness.md](docs/quick-log-daily-hub-readiness.md) - acceptance criteria and rollout checklist for the first feature/fun slice
- [docs/exercise-execution-mode-plan.md](docs/exercise-execution-mode-plan.md) - post-cycle plan for one-hand/two-hand/machine/pulley execution modes
- [docs/session-variants-i18n-plan.md](docs/session-variants-i18n-plan.md) - implemented milestone spec for per-session mode/load overrides plus ES/EN language system
- [docs/weekly-consistency-streaks-plan.md](docs/weekly-consistency-streaks-plan.md) - implemented milestone spec for custom weekly consistency streaks (v1)
- [docs/read-optimized-weekly-consistency-plan.md](docs/read-optimized-weekly-consistency-plan.md) - shipped foundations, unmerged local work, and remaining read-reduction acceptance criteria
- [docs/commit-versioning.md](docs/commit-versioning.md) - commit keyword rules that drive automatic `major` / `minor` / `patch` bumps

### Published Baseline (November 20, 2026)

- Published version: **2.8.4**, with **848 passing tests** and **74.95% application statements coverage** on its reviewed implementation.
- Delivered: Quick Log, Daily Hub/calendar, session variants, ES/EN, weekly streaks, consistent session counting, decimal-weight validation, accessible chart alternatives, and routine JSON export/import.
- Weekly target changes now work any day without an edit cap and persist across login and offline replay.
- Cloudflare credentials and cache-rule order are repaired: the real workflow purged 64 URLs and verified two complete canonical sweeps of v2.8.4. The old installed-client workout/offline/reconnect journey remains open. [Evidence and limitations](docs/production-cache-evidence-2026-11-20.md).
- Read-optimized weekly consistency v1.1 is **partial**: bounded reads and memory caching are shipped; additional local cache/navigation improvements are not merged into `main`.

### Next Priorities

1. **P0:** finish installed-client preservation/offline/reconnect evidence and the production-delivery closure review; live purge and public coherence now pass.
2. **P1:** verify and harden history, progress, account changes, date boundaries, and cross-device/offline sync.
3. **P1:** complete Daily Hub v1.1 with persistent per-user caching and measured read reduction.
4. **P1:** maintain dependencies and align documented quality gates with reproducible CI/browser checks.
5. **P2:** add a portable workout-history backup, extending beyond existing routine sharing.
6. **P2:** let users correct saved workout values without deleting and recreating a session.
7. **P2:** separate dashboard, Quick Log, weekly calculations, and preference persistence into smaller modules.

Acceptance criteria, evidence, and deferred work live in [UPGRADE-PLAN.md](UPGRADE-PLAN.md).
Individual implementation plans and the two-judge merge gate live in [docs/roadmap/README.md](docs/roadmap/README.md).
The expired six-week schedule has been retired; nutrition and social/competitive features remain deferred.

### Quality Baseline and Remaining Enforcement Work

Published `main` runs lint, CodeQL, app/offline journeys, no-skipped-tests checks, coverage (minimum 70%),
release integrity, and the Chromium upgrade smoke. The local `merge-ready` contract is an unmerged proposal;
repository-wide formatting is not yet an enforced blocking check on published `main`.
The canonical-transport browser regression is now also in CI. Main's initial v2.8.4 upgrade-smoke failure and
successful retry are both recorded. [PR #105](https://github.com/metalfurius/gym/pull/105) repaired the reproduced
fixture race and added a required delayed-bootstrap case; broader priority-4 browser/device work remains open.
See the roadmap for the distinction between published checks and local stabilization work.

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
- `npm run production:release:smoke` (no-query production metadata, cache headers, every declared asset hash, and disagreement classification)

### Release and update contract

Every release has one revision, `vX.Y.Z`, recorded in `manifest.json`, `release.json`,
the shell metadata, and `sw.js`. The update button requests fresh URLs for release metadata
and the worker. The worker stages the complete local asset set using fresh URLs, validates
asset SHA-256 hashes against `release.json`, and checks the shell revision before activation.
Cloudflare can rewrite HTML for security and performance, so the shell is checked by revision
rather than by byte hash; JavaScript, styles, icons, and the web manifest are hash-checked.
It reports an error and keeps the installed release if an intermediary returns stale files.
The deployed `_headers` policy documents the no-store intent for canonical metadata. GitHub Pages still emits
its own cache headers, so the main-only `.github/workflows/cloudflare-cache.yml` runs after the Pages
deployment, validates the account-owned token through Cloudflare's account-token endpoint without
printing it, resolves the non-secret account/zone relationship, reconciles the fixed `/gym/` Cache
Rule, purges only the canonical no-query URLs and declared asset set, and verifies the deployed hashes
before the release is considered ready.

An installed client activates a waiting worker through `SKIP_WAITING`, backs up the in-progress
workout, and reloads after activation. A backup is restored only if no current workout exists.
Old revision caches are deleted only after the verified worker activates. Clients stuck on a
previous version can use `/gym/actualizar.html` once to install the verified current release.

Run `npm run release:check` before publishing. The check verifies metadata agreement, every
cached local asset and SHA-256 hash, shell and module references, and two consecutive deterministic
build revisions.

Production verification repeats the no-query canonical check and reuses a previously-installed
client to confirm update activation, preserved workout state, offline recovery, and reconnect
without manual cache clearing.

Transient Cloudflare 403/5xx responses are retried and reported as edge-layer diagnostics; asset,
metadata, service-worker, and Pages disagreements remain hard failures. If Cloudflare returns a
managed challenge to the GitHub Actions runner, the smoke starts an isolated ephemeral Chromium
session to obtain the browser clearance (using an Xvfb-backed headful session on Linux runners),
then fetches the same no-query canonical URLs in that session. A challenge is never treated as a pass,
and all revision, manifest, shell, service-worker,
asset-hash, and response-stability checks still run unchanged.

The installed-client smoke waits for both the replacement controller and application-level session
restoration before checking offline and reconnect behavior.
