# Test suite and browser evidence

Use Node 22.13+ on the Node 22 line (CI installs the latest 22 patch), or Node 24, and install the locked
versions with `npm ci`. Jest runs ES modules through Node's `--experimental-vm-modules`; its experimental
warning is expected. Scripts in [package.json](../package.json) are the executable command reference.

## Automated app and unit tests

```sh
npm ci
npm run test:unit
npm run test:integration
npm run test:app
npm run test:app:offline
npm run test:coverage:gate
```

`npm test` runs the full Jest suite without collecting coverage. `test:unit` and `test:integration` select
those folders. `test:app` first checks lint errors and then runs the six app journey files listed in
`test:app:only`; `test:app:only` omits that lint step. `test:app:offline` is the dedicated two-file
recovery/retry subset. Use `npm run test:watch` for iteration or `npm test -- --runInBand path/to/file.test.js`
for a focused regression.

The app journeys exercise authentication/navigation, routines, session resume/save, same-day sessions,
language changes, numeric validation and offline/retry behavior in Jest/jsdom. Firebase URL imports map to
`tests/mocks/firebase-{app,auth,firestore,state}.js` in [jest.config.js](../jest.config.js). This establishes
mocked behavior, not a real backend, device, browser layout or installed-PWA result.

Useful locations:

| Location | Purpose |
| --- | --- |
| `tests/unit/*.test.js` | Production helpers, UI units, release integrity, browser-process/installer and quality-tool regressions |
| `tests/integration/*.test.js` | Module workflows and app journeys using Firebase mocks |
| `tests/mocks/` | Firebase runtime/state fixtures |
| `tests/utils/test-helpers.js` | Mock users, routines, sessions and timestamps |
| `tests/setup.js` | Jest browser setup/teardown |
| `tests/manual/` | Interactive manual sheets; opening a sheet does not record a pass |

## Quality and coverage commands

```sh
npm run lint:ratchet
npm run test:no-skips
npm run test:coverage:gate
npm run release:check
```

The zero-warning ratchet checks authored `.js`, `.cjs` and `.mjs`, including the real-browser harnesses.
`lint:errors` is available for errors-only iteration and does not replace that ratchet. ESLint 10 uses
[eslint.config.mjs](../eslint.config.mjs); see the [major migration rationale](../docs/eslint-10-migration.md).
No-skips rejects `.skip`, `xit` and `xdescribe`.

`test:coverage` collects the full suite and enforces Jest's global **70% statements and lines** thresholds.
Reports are `coverage/coverage-summary.json`, `coverage/lcov.info`, HTML and `coverage/junit.xml`.
`coverage:gate` validates an existing summary's finite statement percentage against 70%; it cannot establish
freshness or test success on its own. `test:coverage:gate` runs the full suite first and only invokes that
wrapper after success. There is no dated threshold or environment override. Branch/function metrics are
reported without an additional enforced threshold.

`test:all` combines the ratchet, no-skips and full gated coverage suite, which includes unit and integration
cases. It does not run browsers, install dependencies or replace hosted CodeQL. Keep focused app/offline
commands when reproducing the separate steps in the Tests workflow. `format:check` is advisory in CI; its
local nonzero exit still indicates formatting differences.

## Real browsers

Follow [browser-quality-gates.md](../docs/browser-quality-gates.md) to install the exact official archives
and set `CHROME_PATH`/`FIREFOX_PATH` and expected versions. The installer owns a separate automation cache;
never pass a personal browser profile. A missing/invalid explicit executable fails rather than falling back.

```sh
npm run test:e2e:upgrade
npm run test:e2e:upgrade:firefox
npm run test:e2e:numeric
npm run test:e2e:session-counting
npm run test:e2e:canonical-transport
node scripts/verify-browser-smoke-negative.mjs chromium
node scripts/verify-browser-smoke-negative.mjs firefox
```

Select numeric Chromium/Firefox with `NUMERIC_SMOKE_BROWSER=chromium`, `firefox` or `all` (set the variable
using your shell). `UPGRADE_SMOKE_BOOTSTRAP_DELAY_MS=1000` enables the required delayed Chromium case.
`BROWSER_SMOKE_EVIDENCE_DIR` and `UPGRADE_SMOKE_EVIDENCE_DIR` can select fresh artifact directories; their
defaults are unique temporary directories. Historical `Validation Evidence/` files are not overwritten.

Upgrade fixtures test release A→B, the explicit update action, exact workout preservation, release/module
hashes, obsolete-cache removal and offline/reconnect. Numeric fixtures import the production validation
helpers in real browsers. Counting Chromium imports production counting helpers and checks two same-day
sessions versus one active day and duplicate replay. The canonical fixture verifies that the transport
actually reaches canonical network URLs despite an active worker. These loopback fixtures use synthetic data
and do not prove a production account or physical iOS scenario.

Browser jobs have deadlines, bounded cleanup of owned processes and JSON/screenshots/traces. The negative
checker runs a deliberately failing real numeric child, requires child exit 1 and failed evidence, then
returns 0 only when that expected failure is confirmed. It does not turn a failing positive smoke into a pass.

## Actual CI mapping

[TESTING-PLAN.md](../TESTING-PLAN.md) maps all commands to workflows and enforcement. In particular:

- `Tests / Run Tests` runs release integrity, normal/delayed Chromium upgrade, canonical transport,
  app/offline journeys, no-skips and full gated coverage.
- `Lint / ESLint` requires zero warnings; CodeQL performs separate hosted security analysis.
- `Browser Gates` runs Firefox upgrade, numeric Firefox/Chromium and counting Chromium on both Ubuntu 24.04
  and Windows 2025. Its numeric jobs also verify real failure evidence. Browser artifacts upload on failure.
- Codecov retains `fail_ci_if_error: false`; JUnit annotations retain `fail-on-error: false` and the
  same-repository/fork permission guard. A missing JUnit report still fails under upstream's `fail-on-empty`
  default. Failed Jest/coverage commands always fail Tests.
- Format Check reports warnings without failing the workflow for formatting differences. No implemented
  `merge-ready` command is claimed.

## Manual and live checks

Run `npm run serve`, then open `http://localhost:8080/tests/manual/index.html` for the interactive sheets.
Record the actual observed result, device/browser versions, revision and UTC time. Firebase mocks, desktop
viewport resizing and real desktop fixtures cannot substitute for physical Safari and an installed iOS
Home Screen app. QA-05 in [objective 4](../docs/roadmap/04-maintenance-quality.md) remains open.

Use only designated test accounts for explicitly authorized live tests. Do not include tokens, another
account's workouts or personal browser-profile contents in artifacts. Preserve existing dated evidence and
pin fresh implementation acceptance to the exact final reviewed SHA under the shared two-judge protocol.

## Writing and troubleshooting tests

Keep setup isolated, reset shared mocks/state and clean up owned temporary resources. Prefer assertions on
observable behavior and important failure paths over source-string checks or tests that repeat the code.
Do not skip a regression or relax a rule/threshold to make CI green. Reproduce a failure with the focused
Jest command above; use the browser's JSON/trace and stderr when a real smoke fails. For startup/install
failures, check the declared executable and documented sandbox/native read permissions; do not disable the
browser sandbox. A stale cached-asset hash requires the reviewed release contract to be regenerated, not a
weakened release assertion. Release preparation is documented in
[commit-versioning.md](../docs/commit-versioning.md).

The November 27 maintenance run found an existing private TEMP Firefox cache that could not spawn its
socket/tab subprocesses. A fresh verified install in a dedicated public automation-cache directory passed;
the same four key binaries matched, but directory ACLs differed. Both outcomes are retained in the
[maintenance record](../docs/maintenance-toolchain-2026-11-27.md). If reproducing that environment, configure
`BROWSER_SMOKE_CACHE_DIR` to a new dedicated automation directory before the documented installer runs;
do not change a personal profile's ACL or turn off the sandbox. Fresh hosted CI remains required.
