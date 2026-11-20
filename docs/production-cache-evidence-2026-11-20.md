# Production delivery evidence — November 20, 2026

Objective 1 is **partial**. The credential, policy repair, purge and canonical checks below passed on the real
service. The old installed-client workout journey remains **not run**, and this record does not close the objective.

## Immutable implementation and deployment

- Reviewed prerequisite: [PR #103](https://github.com/metalfurius/gym/pull/103), head
  `78d4153bf56141f020e8bccc50f036f557a535ae`, base `4a0f14163399e42955103f3482eee1920d1436bb`.
- Two distinct independent judges, each GPT-6.1-Sol with xhigh reasoning, approved that exact head before merge.
  Their prerequisite-only verdicts and additional CodeQL analysis are preserved in the PR description.
- Squash merge/deployed/control/target SHA: `9028320061aa388cd529a5a415d4785e1e084a82`; its tree equals the reviewed head.
- [Pages run](https://github.com/metalfurius/gym/actions/runs/44733781150), deployment `7941301735`,
  `github-pages`, status `success` at **12:12:44 UTC**, exact target SHA above.
- [Release v2.8.4](https://github.com/metalfurius/gym/releases/tag/v2.8.4),
  [Create Release run](https://github.com/metalfurius/gym/actions/runs/44733781575).

## Actual Cloudflare and canonical results

The authorized authenticated Chrome session was used to create a zone-scoped account token with Zone Read,
Cache Settings Write and Cache Purge for `codeoverdose.es` only. The token value was passed directly to the
GitHub `production` environment secret and is absent from this record. Account-token verification and zone
owner discovery returned HTTP 200; the subsequent workflow exercised actual write and purge capabilities.

[Production workflow 44733829284](https://github.com/metalfurius/gym/actions/runs/44733829284/job/136280080167)
completed successfully at **12:13:09 UTC**. Its final delivery guard passed at **12:13:05.517 UTC**.

- Gym rule ref `gym-pwa-fixed-cache-policy-v1` was **reordered**, retaining rule ID
  `71339a5f16554e7c8bf5792d45674b8c` and ruleset `fb7c0ca335fd4f5db70a8ee340c5eeec`.
- Before: portfolio bypass, Gym bypass, Cache Everything. After: portfolio bypass, Cache Everything, Gym bypass.
  A separate read of the live entrypoint confirmed Gym is last and `cache: false`.
- **64 canonical URLs** were purged in three batches. Cloudflare returned
  `6e94701add9042511a83e8a69f2cca62` as the `id` for each batch. These are the returned identifiers;
  no uniqueness between batch identifiers is implied.
- Deployment/current-main guards passed at readiness, before all three batches, before both sweeps and before success.

| Sweep | UTC start | UTC completion | Responses | Result |
| --- | --- | --- | --- | --- |
| 1 | 12:12:51.709 | 12:12:56.740 | 64 | All passed, v2.8.4 |
| 2 | 12:13:02.965 | 12:13:04.393 | 64 | All passed, v2.8.4 |

The observed inter-sweep interval was **6,225 ms**. Both sweeps used the isolated headed Chrome challenge
transport with HTTP cache disabled and service-worker interception bypassed. Every requested URL was canonical,
without a query or fragment. Shell revisions, manifest/release metadata, worker and all declared assets passed
the exact target manifest checks. Root and manifest responses were HTTP 200 with `cf-cache-status: DYNAMIC`.
The report retains response timestamps, cache headers, hashes and per-URL verdicts; transformed HTML hashes
can differ while the established normalized shell check still passes.

Immutable [JSON artifact](https://github.com/metalfurius/gym/actions/runs/44733829284/artifacts/14627941471):
`canonical-cache-gym-9028320061aa388cd529a5a415d4785e1e084a82-control-9028320061aa388cd529a5a415d4785e1e084a82`.
The extracted `production-release-smoke.json` SHA-256 is
`4c0dcc15cb656492e537a3942828b56954b467a09bf614a428828eb41d4cd914`.

## Original weekly-target problem: actual production check

A fresh isolated Chrome **157.0.8103.80** browser context on Windows loaded canonical production v2.8.4.
Only a designated synthetic account was used; no personal workouts were modified. The actual settings UI
saved **5 → 2 → 6 → 4** in the same week. Independent server reads after each save matched both
`weeklyTargetSessions` and compatibility alias `weeklyTargetDays`; `savesUsed` reached **4**.
After reloading, the selector showed **4**, the dashboard **0/4**, and the server still held **4**.

- [Captured server/UI observations](../Validation%20Evidence/2026-11-20-weekly-target-production.json), SHA-256
  `77effaec1bf5092fb2e20e00f40d5ee12cb4a20557a5736f3ab96abadd0c01ae`.
- [Settings screenshot](../Validation%20Evidence/2026-11-20-weekly-target-production.png), SHA-256
  `165d3c75423de1d802ff58e8ba1fa6a555472043f187e621dda1124259f7844d`.

This confirms fresh-client publication and settings persistence. It is **not** an old installed-client update test.

## Automated results and retained failure

[Reviewed-head Linux CI](https://github.com/metalfurius/gym/actions/runs/44732937375/job/136277019239) passed:
56 suites/848 tests, 74.95% application statements, app/offline journeys, release integrity, no-skips and Chromium
upgrade/canonical checks. All required lint and CodeQL checks passed. Both judges independently ran eight
focused suites/61 tests and the real Windows canonical-transport regression. The Linux canonical test completed
in four seconds, resolving the earlier process-cleanup hang.

[Main Tests attempt 1](https://github.com/metalfurius/gym/actions/runs/44733781790/attempts/1) **failed** in the
pre-existing upgrade fixture: its document stayed v2.7.0 while metadata and the only remaining cache were v2.7.1.
[Attempt 2](https://github.com/metalfurius/gym/actions/runs/44733781790/attempts/2) passed on the identical SHA.
The first failure is retained; a successful retry does not establish reproducibility.

A read-only investigation reproduced the state with the original worker and a delayed temporary fixture:
an early harness reload can miss `controllerchange`. The cache-existence condition precedes completed
installation; the harness then forces a reload while the fixture also schedules reloads. One subsequent
navigation recovered B. The exact event ordering of the CI failure was not captured. Persistent failure is
demonstrated in the fixture; it has not been demonstrated in the real application, which has additional
shell/metadata recovery. No application fix or installed-client pass is inferred from that diagnosis.

The focused objective-4 prerequisite [PR #105](https://github.com/metalfurius/gym/pull/105) subsequently removed
the early reload and introduced lifecycle/control barriers, a trusted Apply action and one controller-change
reload. Both independent GPT-6.1-Sol xhigh judges approved exact head
`0349c3fc16179ad6ea4e5e5947d1d21f932a9f33` before its normal squash merge
`626b63ba0884f410aec636e87351a074fd4baa97`. Its [Linux CI](https://github.com/metalfurius/gym/actions/runs/44737906631)
passed normal and 1,000-ms delayed-bootstrap cases plus all existing gates; each judge also ran a corruption
negative that exited 1 with failure artifacts. [Runner details](chromium-upgrade-smoke.md).
This resolves the reproduced fixture race; dependency work, other browser coverage and real iOS remain open.

## Open criteria

| Criterion | Observed state |
| --- | --- |
| P0-01 | Real token verification, policy repair and scoped purge passed |
| P0-02 | Exact successful deployment and repeated stale-run guards passed |
| P0-03 | Two complete canonical production sweeps passed |
| P0-04 | **Not run:** old OS-installed client update, workout preservation, offline reopen, reconnect and one saved ID |
| P0-05 | Reviewed checks passed; first main fixture failure/retry retained and reproduced race repaired by reviewed PR #105 |
| P0-06 | Partial evidence documented; final closure awaits the missing journey and both judges |

A retained v2.8.3 browser profile has an active service worker and synthetic in-progress workout on disk, but
OS standalone installation was never established. Automatic approval review rejected relaunching that test
browser with only the explanation “blocked by policy”; its data was preserved. It cannot supply the missing
installed-client proof. No storage clearing, worker removal or emergency-page result is being substituted for it.
