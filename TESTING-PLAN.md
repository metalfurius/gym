# Testing policy and executed checks

Updated November 27, 2026. This is the continuing policy after the expired March–May stabilization cycle.
The executable contract is [package.json](package.json), [jest.config.js](jest.config.js),
[eslint.config.mjs](eslint.config.mjs) and the linked workflows. Use Node 22.13 or newer on the Node 22 line
(CI installs the latest 22 patch) and `npm ci` from the lockfile. Node 24 is also supported by the toolchain.

## Command to CI mapping

| Local command/check | Executed CI location | Enforcement |
| --- | --- | --- |
| `npm run lint:ratchet` | [Lint / ESLint](.github/workflows/lint.yml) | Zero errors and zero warnings across authored JS/CJS/MJS |
| `npm run test:app` | [Tests / Run Tests](.github/workflows/test.yml) | Errors-only lint, then the app journeys in jsdom/Firebase mocks |
| `npm run test:app:offline` | Tests / Run Tests | Dedicated recovery/retry subset must pass |
| `npm run test:no-skips` | Tests / Run Tests | Rejects `.skip`, `xit` and `xdescribe` |
| `npm run test:coverage:gate` | Tests / Run Tests | Full Jest suite, then permanent statement floor of 70% |
| `npm run release:check` (`build:check`) | Tests / Run Tests; [Version Metadata](.github/workflows/version-bump.yml) for matching PR paths; [Create Release](.github/workflows/release.yml) | Coherent revision, cached-asset hashes and two deterministic builds |
| `npm run test:e2e:upgrade` | Tests / Run Tests, normal and 1,000 ms delayed bootstrap | Real isolated Chromium two-release fixture with update, exact workout, offline/reconnect and hashes |
| `npm run test:e2e:canonical-transport` | Tests / Run Tests | Canonical network body despite an active worker; bounded owned-browser cleanup |
| Firefox upgrade, numeric in both browsers, Chromium counting | [Browser Gates](.github/workflows/browser-gates.yml), eight Linux/Windows jobs | Real assertions, pinned browser archives, negative runner and evidence artifacts |
| `node scripts/live-sync-qa.mjs --validate-run ...` / `--live ...` | Browser Gates, separate explicit manual/branch/boolean opt-in Ubuntu B job; paired Windows A run by root | [47-phase real Firebase protocol](docs/live-sync-qa.md); clean identical SHA/calendar and both complete artifacts required; separate from eight fixture jobs |
| CodeQL | [CodeQL](.github/workflows/codeql.yml) | Hosted security analysis; there is no equivalent npm script |
| `npm run format:check` | [Format Check](.github/workflows/format-check.yml) | Advisory: workflow reports warnings without failing for formatting differences |

Browser environment variables, installation, timeouts and artifact commands are in
[browser-quality-gates.md](docs/browser-quality-gates.md). Repository rules must require the intended contexts;
listing a workflow here does not configure branch protection. Codecov retains `fail_ci_if_error: false`.
JUnit annotations retain `fail-on-error: false` and the fork guard; a missing report still uses the upstream
`fail-on-empty: true` default. Neither reporting step replaces the blocking test/coverage exit codes.

## Permanent coverage floor

Jest requires **at least 70% global statements and lines**. `npm run test:coverage` runs that full suite and
writes `coverage/coverage-summary.json`, LCOV, HTML and JUnit. It does not run the separate no-skips, lint or
browser gates. `npm run coverage:gate` only validates an existing summary's statement percentage: it does not
prove the tests passed or that a report is fresh. Use `npm run test:coverage:gate` to run tests first and check
their freshly generated summary only on success. Expired dates and `COVERAGE_GATE_DATE` cannot lower the floor.
Branch and function coverage are reported; no extra branch/function threshold is claimed.

`npm run test:all` combines the zero-warning ratchet, no-skips and full gated coverage suite. That suite
includes unit and integration/app/offline tests. It does not install dependencies, regenerate a release,
run real browsers or replace hosted CodeQL. Run the dedicated app/offline commands too when reproducing CI.

## Review and release candidates

Keep meaningful regressions for changed behavior, including account ownership, offline replay and date
boundaries where relevant. A failed gate blocks a merge candidate; resolve it before resuming feature merges.
Do not add skipped tests, lower thresholds or disable a rule to hide failures. Formatting is advisory, so avoid
unrelated repository-wide rewrites.

Follow the [release contract](docs/commit-versioning.md) for cached-asset changes. A metadata mismatch is a
failure until the final generated contract is committed and rechecked, even for behavior-neutral JS changes.
Preserve dated evidence as historical evidence and pin fresh CI/manual results to the exact reviewed SHA.
Roadmap implementations require the [two-judge protocol](docs/roadmap/README.md); older-head approvals do not
approve a changed candidate.

Jest uses Firebase mocks and local DOM/synthetic protocol fixtures; browser smokes use loopback fixtures.
Neither proves live cross-account/device sync, production delivery or physical iOS behavior. The separately
opted-in paired Firebase runner requires actual Windows/Ubuntu accounts/SDK/UI evidence on the final reviewed
SHA; authoring checks are not LIVE results. It preserves the last-page Quick Log sentinel and adds four distinct
capture/details/suggestion checks, latest-strength deletion/fallback, and measured online HTTP overlap with
one applied/one conflict receipt. Its measurement limits are explicit in the linked protocol.
QA-05 and objective 4 remain open until the actual Safari
and installed Home Screen PWA scenarios in the [objective plan](docs/roadmap/04-maintenance-quality.md) pass.
