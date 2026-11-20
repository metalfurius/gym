# Objective 2 local implementation evidence

Recorded November 20, 2026. **Local, unmerged candidate evidence; objective remains
open.** No production/account data or credentials were accessed by this implementer.
The parent owns the real-backend/two-client run and final candidate freeze/reviews.

- Original implementation/reproduction baseline: `4a0f14163399e42955103f3482eee1920d1436bb`.
- Integration base: `54e83fbfb263be2e601e1db3d2074275329de40e`, including the reviewed production tooling,
  controlled Chromium runner and partial production evidence.
- Worktree/branch: `C:\tmp\gym-roadmap-02`, `codex/roadmap-02-history-sync`.
- Candidate SHA is recorded in the PR, avoiding a self-referential commit hash.
  `source-files.sha256.json` records the integrated source/test/docs/release bytes with LF-normalized text.
- Integration release metadata is **v2.8.5**, 68 cached assets, regenerated after resolving only the generated
  release manifest during rebase. This is not a published release or deployment result.

The command table and attached coverage/browser files below preserve the implementer's earlier local checks
on the v2.8.3 candidate. They are historical regression evidence, not claims about the final integrated SHA.
The parent must run the current gates and real-backend sequence against the integrated release before acceptance;
final CI and live evidence are pinned separately in the PR record.
- Runtime: Windows NT `10.0.26200.0`, Node `v24.12.0`, npm `11.6.2`; local Chromium fixture uses Chrome `157.0.8103.80`.

## Scope and criterion matrix

| Criterion | Local result and evidence | Completion dependency |
| --- | --- | --- |
| SYNC-01 | Passed deferred Progress exercise/period/metric/list/library-callback, History pagination/result/error, Calendar month/result/error and preference A/B/A read/write tests. Assertions include rows, chart, accessible table, stats, spinners, errors, control values and cache writes. | Final SHA review; real journeys remain separately recorded. |
| SYNC-02 | Passed actual-app A/B/A plus cold offline owner recovery for History/Progress/targets/suggestions; durable queue retains foreign-owner work; pending writes cannot apply to the new account. Owned/legacy draft and automatic version-backup tests pass. | Final real account-switch/reconnect evidence. |
| SYNC-03 | Passed actual app UI journey with mocked Firestore: decimal capture, online/offline Quick Log, exact persisted-ID replay, same-day sessions, latest-strength deletion, suggestion fallback, chart/table/stats clearing, first/last-page deletion and offline cold reload. | Repeat exact-ID comparisons on the designated backend/client pair. |
| SYNC-04 | Passed independent-intent Firestore MVCC retry tests: same/different weeks, offline chains, skewed clocks, lost acknowledgement, explicit durable conflicts, legacy migration, metadata/aliases/frozen outcomes, and original timestamps. Public UI conflict resolution and permanent-error rollback pass. | Real two-client sequence on final candidate SHA; no mock result substitutes for it. |
| SYNC-05 | Passed fixed expected UTC/Europe/Paris/America/Los_Angeles matrix: Sunday/Monday, local midnight, month/year boundary, spring/autumn 2026 DST, week keys/window starts/month counts/streaks. Timestamp equality and finalization timestamp preservation pass. Local-week Settings/Hub and preserved pre-target legacy baseline regressions pass. | Final live boundary/replay observations. |
| SYNC-06 | Passed empty/exact/over limits (Progress 300/301; Hub 1500/1501), offline legacy/page/cold snapshots, stale Firestore metadata, bounded Calendar and final millisecond of local month. Incomplete inputs cannot freeze outcomes; transaction rechecks target/session revisions. ES/EN limited states verified. | Final high-volume/backend metadata confirmation when available. |
| SYNC-07 | Local common gates passed, including coverage >=70%, local release graph/two-build check and Chromium upgrade/offline restart fixture. Spanish fields, aliases, numeric validation, imports and persisted identity guards retained. | CodeQL/CI and both GPT-6.1-Sol xhigh reviews of identical final SHA; final release regeneration after integration. |

## Commands and observed exits

All commands ran in the isolated objective 2 worktree. No gates were weakened and
no source tests were skipped.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm ci` | 0 | Clean installation completed. |
| `npm run lint:ratchet` | 0 | No warnings/errors. |
| `npm run test:no-skips` | 0 | No skipped test declarations. |
| `npm run test:app` | 0 | 6 suites / 6 app journeys passed. |
| `npm run test:app:offline` | 0 | 2 suites / 2 offline recovery/retry journeys passed. |
| `npm run test:coverage:gate` | 0 | 58 suites / 863 tests passed; statements **78.51%** (required >=70%), lines 81.02%. |
| `npm run release:write` | 0 | Local v2.8.3 manifest hashes generated; 68 cached assets. |
| `npm run release:check` | 0 | Current graph verified; deterministic two-build v2.8.3 → v2.8.4 fixture passed. |
| `npm run test:e2e:upgrade` | 0 | Local Chromium controlled upgrade, exact draft preservation and offline restart passed. |
| `node scripts/reproduce-sync-baseline.mjs` | 0 | Expected baseline Jest exit 1 was reproduced: 11 failed new regression assertions, 0 passed. This script's success means reproduction, not baseline correctness. |

The full coverage run includes the new `app-sync-accounts`, `app-sync-completeness`,
`app-sync-surfaces`, `weekly-preferences`, `offline-owner-queue`, `calendar-clock`
and expanded History/Progress/Calendar/session/version/cache suites.

Initial development checks also caught an import-cycle regression, stale release
hashes, and timing-sensitive offline teardown; those were fixed and the listed
final checks rerun. They are not recorded as current passing behavior before the
fix. The roadmap index and active upgrade queue are deliberately unchanged.

## Concrete baseline reproductions

[baseline-races.txt](baseline-races.txt) was generated by loading the original
baseline Progress/History modules into temporary sibling files and running the
same new deferred tests. Candidate modules were never replaced. Temporary files
were removed in `finally`.

Observed failures include an older exercise response creating a second chart,
an older error applying the no-data state, an old period request rendering before
the current one, a delayed chart-library callback rendering after selection clear,
A → B → A restoring Bench over the newer Squat selector, same-day persisted session
count `2` instead of `3`, old-account History rows/errors applying after B, concurrent
pagination showing page `3` instead of `2`, post-mutation stale row/cache application,
and absent completeness metadata on an offline page. These are 11 regression
assertions, not a claim of 11 unrelated root causes. Pattern-filtered baseline
runs naturally exclude unrelated tests; the separate no-skips gate remains green.

Two additional regressions found during implementation covered a future-week
Settings value `5` replacing the current legacy `7`, and an unfrozen pre-target
week incorrectly using target `3`/`met=true` instead of preserved `7`/`false`.
Both now pass; they are not included in the baseline-4a reproduction count.

The final ownership audit found no real constructor omitting UID, and all real
handlers already rejected such invalid payloads. A queue API harness nevertheless
reproduced an unverifiable legacy descriptor being counted as B (`1` instead of
`0`) and dispatched to a registered test handler. That is a verified queue-boundary
failure, not evidence of a real app data leak. It is now retained as `unowned`,
excluded from B's pending count/dispatch, with explicit global scope reserved for
non-account handlers/callbacks. Both count/dispatch regressions pass.

## Artifacts and limits

- [coverage-summary.json](coverage-summary.json): complete local coverage summary.
- [upgrade-chromium.json](upgrade-chromium.json): raw local browser run, console/
  exception lists and cached-asset hashes. The executable fixture intentionally
  simulates release `v2.7.0` → `v2.7.1`; those are fixture labels, not the app's
  deployed versions or proof of a production upgrade.
- [Desktop](upgrade-chromium-desktop.png), [mobile viewport](upgrade-chromium-mobile.png)
  and [update available](upgrade-chromium-update-available.png) captures from that run.
- `artifacts.sha256` hashes these attachments. Historical dated artifacts were
  restored unchanged after the legacy runner generated its default output names.

No real backend/device completion evidence is claimed here. The parent has a
separate preliminary real-backend log; it must be replayed/pinned to the final
candidate before acceptance. CodeQL, final immutable candidate SHA, final release
metadata and both independent judge verdicts are **not run / pending** in this
local record. See the [contract and live sequence](../../docs/history-progress-sync-contract.md).
