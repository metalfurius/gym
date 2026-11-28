# Paired Firebase QA extension: authoring handoff

**LIVE NOT RUN.** This ledger records local QA tooling checks only. No credential, account login, Firebase
request, workflow dispatch or service write was used for this extension. Jest uses synthetic protocol/CDP
events and local DOM fixtures; the real UI renderer/cache is exercised with injected read-only observation
and public-event routing. These fixtures do not prove deployed behavior, real concurrent commits, cache
invalidation against Firebase, cross-machine convergence, iOS or objective completion.

Isolated worktree: `C:/tmp/gym-roadmap-live-qa-extension`; branch
`codex/roadmap-live-sync-qa-extension`; base **`bdab128435e128a70bce1a382bfa22340cb64c74`**.
The root owns the separate runtime fixes and final integration. No other worktree was edited. No application
JS/CSS/HTML, worker, release metadata, dependencies, workflow, browser runtime or security policy was changed.
The original [39-phase authoring ledger](../2026-11-27-live-sync-qa-authoring/README.md) remains historical.
The [source manifest](source-manifest.json) records canonical LF hashes; the handoff identifies the subsequent
clean local commit. No push or merge is performed by this subtask.

## Extension

- [47 declarative phases](../../scripts/live-sync-qa-scenarios.mjs): the previous sequence is retained, adding
  six online race/resolution phases and latest-strength deletion plus a third complete surface sweep.
- Four public normal captures use 50.5, 51.5, 52.5 and 53.5 kg, all 8 reps. Their supported calendar values
  advance exactly one second on the same day. Persisted original dates are checked, and the calendar is reset
  to `currentCalendarIso` before surface checks. Quick Log count still derives from the complete baseline so
  the true last page contains one owned backdated sentinel. Its public deletion/assertion remains separate.
- Each sweep compares exact baseline/created/deleted ID membership and unchanged full record hashes, all
  history IDs, Hub month/week counts and the calendar day count. Each remaining strength detail and the
  sentinel detail are opened through the actual row's View button by ID: label, original model timestamp,
  visible localized date, weight/reps or unique note must match. The row selector reflects the real UI's
  ID-less View button; DOM regressions prevent a plausible but nonexistent button selector.
- Progress session count, best record, displayed daily table and public Chart.js dataset must agree at 4
  records / 53.5 kg, then 3 records / 52.5 kg. The runner starts a public capture, inspects the numeric and
  visible latest suggestion, uses the real fill button and cancels. A complete server ID/value comparison
  ensures no inspection Save occurred. The latest-strength deletion must select the fourth recorded ID,
  preserving three records and requiring fallback to the third record's 52.5/8 suggestion.
- The separate online case keeps both clients online from an identical revision/operation/fingerprint and
  server-record hash. Ready controls precede coordinated public Save clicks. Real CDP latency supplies a
  window for a causal handshake of the same first HTTP Commit on each host. Only bounded metadata is retained;
  headers/bodies, URL/query values and CDP request IDs are excluded. A failed/expired first request cannot be
  replaced by a later retry; failures retain the partial safe metadata window with its completeness flag.
  Exactly one applied receipt, one conflict receipt, winner value and week/global
  revision +1 are required. The loser resolves with a fresh public press; both original receipt hashes,
  including update times, must remain unchanged.

The [protocol](../../docs/live-sync-qa.md#online-race-measurement-and-limits) distinguishes **client-observed
HTTP overlap**, including emulated response latency, from simultaneous server execution. It does not infer
cross-host clock synchronization or associate bodies with operation IDs. Incomplete overlap fails the run;
the runner neither silently retries the scenario nor claims live evidence from a synthetic unit test.

## Executed local checks

| Check                                                           | Result                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                        | Exit 0 from the unchanged lockfile; no dependency update                                                                 |
| Six focused suites                                              | [83 tests passed](focused.txt), including 54 QA assertions and 29 existing browser ownership/runtime/sandbox tests       |
| `npm run lint:ratchet`                                          | [Exit 0, zero warnings](lint.txt), ESLint 10                                                                             |
| `npm run test:no-skips`                                         | [Exit 0](no-skips.txt)                                                                                                   |
| `npm run release:check`                                         | [Exit 0](release.txt), existing v2.8.6 / 75 assets, deterministic temporary two-build check; no bump/write               |
| Syntax, phase/scope checks and real uncredentialed CLI negative | [Static authoring checks](static-checks.json); missing credentials exits 1 with empty stdout, before browser/service use |
| Final clean exact-SHA `--validate-run`                          | Executed after the local commit; result and path supplied with the frozen SHA in the handoff, outside the checkout       |

Focused command:

```sh
npm test -- --runInBand tests/unit/live-sync-qa.test.js tests/unit/live-sync-qa-extension.test.js tests/unit/live-sync-qa-ui.test.js tests/unit/browser-smoke-runtime.test.js tests/unit/browser-sandbox-permissions.test.js tests/unit/owned-browser-process.test.js
```

Negative regressions include credential/body-access traps, foreign-project/endpoints, incomplete/offline or
transport-failed Commit observations, replacing an expired first request, causal handshake expiration, two
applied receipts, changed semantic bases, wrong revisions/winner values, missing HTTP end/proof, changed receipt
timestamps, wrong strength deletion and changed original dates. Actual ES/EN renderer checks reject wrong detail
labels/dates/load/reps (including an unrelated 8-second rest badge) and stale 53.5 suggestions after a 52.5
fallback is expected. The suggestion-cache test deliberately supplies a rebuilt local fixture: Firebase
deletion/invalidation is reserved for the real paired run.

## Remaining root gates

Integrate onto the final corrected runtime candidate, freeze its new SHA, review it independently twice, then
run the [paired instructions](../../docs/live-sync-qa.md) on Windows and Ubuntu with a new UUID, matching approved
calendar pair and private fixed-account credentials. Review both 47-phase artifacts and all cleanup results.
Actual SDK transport timing and the added surface passes have **not** been timed live here; the unchanged
15-minute global / 120-second peer / 60-second cleanup limits remain fail-closed. Do not convert a deadline,
missing artifact, unproven HTTP overlap or one-machine result into success. The long native outbox fixture was
intentionally not repeated for this QA-only change. Runtime fixes, live service evidence, PWA upgrade and
physical iOS requirements remain separate and open.
