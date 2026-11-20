# 4. Maintain dependencies and reproduce quality checks

Status: planned. Baseline: v2.8.3 / `d4c6d0d`; PRs [#67](https://github.com/metalfurius/gym/pull/67) and
[#70](https://github.com/metalfurius/gym/pull/70) need reassessment against current main. A physical iOS device
and an installed Home Screen app are hard dependencies for final mobile evidence. Use the [shared review protocol](README.md).

## Starting point and boundaries

The repository uses Node 22 in CI and a locked Jest/ESLint/Prettier toolchain. Tests CI runs Chromium upgrade,
app/offline journeys, no-skips and coverage; lint and CodeQL have separate workflows. Formatting is advisory.
The local `merge-ready` proposal is not delivered policy. Existing Firefox upgrade, numeric-input and
session-counting scripts are useful but browser discovery/platform assumptions must be made reproducible.

Keep application behavior unchanged in maintenance PRs. Split an incompatible major/toolchain migration into a
separate reviewed change; do not merge a whole stale dependency PR merely because its old checks passed.

## Ordered implementation

1. Fetch current #67/#70 metadata, dependency diffs, checks and merge bases. Compare each change with current
   `package.json`, lockfile and Actions versions; identify already-landed, compatible, conflicting and major
   upgrades. Record an explicit disposition for every proposed update. Rebuild the selected changes on current main.
2. Apply compatible dependency/security and action-runtime updates in focused maintenance commits/PRs. Verify
   current official supported Node/action/runtime combinations and changelogs. Refresh the lockfile with the
   declared package manager, run clean `npm ci`, and record audit results without concealing remaining findings.
   Separate incompatible majors with migration/rollback criteria; if required for completion, finish their own reviewed PRs.
3. Map every documented check to a real script and CI job. Align README, CONTRIBUTING, tests/README,
   TESTING-PLAN and versioning documentation with executed policy, >=70% coverage and the release pipeline.
   Remove expired dates/claims where misleading. Do not claim a command, blocking format gate or `merge-ready`
   exists before implementing and validating it. Preserve required checks while changing their implementation.
4. Make existing smoke scripts discover supported Chromium/Firefox binaries through documented environment
   variables or deterministic CI installation. Remove developer-specific defaults from the supported path;
   isolate temporary profiles, ports and output files, and ensure cleanup on failure. Reuse their real assertions.
5. Add appropriate CI jobs for `test:e2e:upgrade:firefox`, `test:e2e:numeric` (supported Chromium and Firefox
   modes) and `test:e2e:session-counting`, retaining Chromium upgrade coverage. Install exact compatible browser
   dependencies, expose commands/timeouts and upload JSON/screenshots on success and failure. Required jobs must
   fail on real failures or absent browsers; a skip or `continue-on-error` does not establish coverage.
6. Execute a focused **actual iOS Safari and Home Screen PWA** run: login, ES/EN decimal comma/dot input and
   whole-rep rejection, two same-day sessions, preserved in-progress workout across background/close/reopen,
   offline cold launch, queued save/reconnect without duplicates and an old-installed-to-new release update.
   Record device model, iOS/Safari versions, display mode and old/new revisions. A desktop viewport, WebKit
   automation or a written test sheet cannot substitute for these observations.
7. From a clean checkout, follow the documented commands on a supported developer environment and CI. Link
   exact-SHA run evidence, remove/close superseded maintenance PRs with their replacement references, and retain
   actual iOS evidence before declaring objective 4 complete. Reuse objective 1 device evidence only if the
   release, device and scenarios genuinely cover both acceptance sets.

## Completion criteria and evidence

| ID    | Required result                                                                       | Evidence                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| QA-01 | #67/#70 resolved against current main, including every incompatible-major disposition | Current diff/version table, final maintenance/replacement PRs and merged/closed status; required majors validated separately   |
| QA-02 | Compatible toolchain/actions run without deprecated-runtime dependence                | Clean install output, lockfile review, official compatibility references and successful action/job logs                        |
| QA-03 | Scripts, docs and blocking/advisory status agree                                      | Command-to-CI table, executable documented command run and unchanged >=70%/no-skips policy                                     |
| QA-04 | Existing Firefox/numeric/counting browsers run reproducibly in CI                     | Exact browser versions, required job URLs, artifacts and a demonstrated negative case that fails the runner                    |
| QA-05 | Actual Safari/iOS installed-PWA scenarios were executed successfully                  | Dated physical-device report, screenshots/logs, observed values, revisions and offline/reconnect results; failures remain open |
| QA-06 | Maintenance causes no product or release regression                                   | Shared app/offline/coverage/lint/CodeQL checks, release integrity, Chromium and Firefox two-version smokes                     |

Every maintenance or major-migration implementation receives **two independent GPT-6.1-Sol xhigh approvals
on its identical final SHA**. Both judges must inspect the full objective closure evidence; successful CI cannot
stand in for QA-05. No available iOS device means this objective remains partial, even if its CI PRs can merge.
