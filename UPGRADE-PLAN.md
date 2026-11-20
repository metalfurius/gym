# My Workout Tracker - Product and Technical Roadmap

Last reviewed: November 20, 2026

## Scope and Status

This is the ordered product and technical backlog. The published baseline is **v2.8.3**, on
[`main` at `d4c6d0d`](https://github.com/metalfurius/gym/commit/d4c6d0d2b8e3950ab1bc97ce9c371dde166fe612).
Status is based on merged code, release checks, and the latest deployment results, rather than the age of a plan.

- **Done:** merged into `main` with validation evidence.
- **Partial / local:** some foundations are shipped, but the remaining implementation is local or unmerged.
- **Next:** the first improvement to complete.
- **Planned:** ordered work with an explicit completion condition.
- **Deferred:** outside the current delivery queue; reconsider only when the stated trigger applies.

The local `codex/stabilize-read-optimized-v1` branch contains work that is absent from published `main`.
In particular, read optimization commit `9a6d883` and the proposed `merge-ready` contract are not shipped.
Port useful changes onto current `main` and validate them against the newer release, counting, and preference contracts.

## Verified Baseline

- Version **2.8.3** was released and deployed on November 20, 2026; the public app was observed updating to it.
- **800 tests across 52 suites** passed for that release. Statements coverage was **74.95%**, above the current **70%** gate.
- Lint, CodeQL, release metadata verification, app journeys, offline recovery/retry, and the Chromium two-version PWA upgrade check passed.
- Production delivery is **partially verified**: the app activates the new release, but automatic Cloudflare purging still fails with HTTP 403 / code 9109. The no-query production check observed an older `manifest.json` alongside the new `release.json`.
- Open maintenance PRs at review time: [#67](https://github.com/metalfurius/gym/pull/67) and [#70](https://github.com/metalfurius/gym/pull/70). There are no open standalone issues; this does not mean the backlog is empty.

Evidence: [release v2.8.3](https://github.com/metalfurius/gym/releases/tag/v2.8.3),
[passing main tests](https://github.com/metalfurius/gym/actions/runs/44721493595),
[successful deployment](https://github.com/metalfurius/gym/actions/runs/44721493501),
[failed cache workflow](https://github.com/metalfurius/gym/actions/runs/44721542763).
These are dated observations, not a guarantee that future commits or deployments pass.

## Delivered

| Status | Capability                                     | Delivered behavior and evidence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Done   | Core workout tracking                          | Authentication, routine editing, strength/cardio sessions, history, rest timer, and in-progress session recovery.                                                                                                                                                                                                                                                                                                                                     |
| Done   | Quick Log, Daily Hub, and activity calendar    | Lightweight workout entries, monthly session count, last workout, weekly progress, calendar activity, and offline queue status. [Scope](docs/quick-log-daily-hub-readiness.md).                                                                                                                                                                                                                                                                       |
| Done   | Exercise variants and ES/EN                    | Execution mode and external/bodyweight load selection during a session, device-local variant memory, previous-workout suggestions, and translated UI. [Scope](docs/session-variants-i18n-plan.md).                                                                                                                                                                                                                                                    |
| Done   | Weekly consistency                             | Monday-based weeks, a rolling 52-week window, current/best streaks, cloud preferences, and frozen historical outcomes. An unfinished current week preserves the previous streak. [Scope](docs/weekly-consistency-streaks-plan.md), [current-week fix](https://github.com/metalfurius/gym/commit/0092457).                                                                                                                                             |
| Done   | Consistent session counting                    | Daily Hub and calendar count persisted sessions; two workouts on one day count twice, and duplicate delivery of the same session is not counted twice. Legacy `*Days` fields remain compatibility aliases. [PR #97](https://github.com/metalfurius/gym/pull/97).                                                                                                                                                                                      |
| Done   | Weekly target editing                          | Target changes work every day without a three-edit cap, survive logout/login, and replay offline changes. Preferences load before dashboard finalization so they are not overwritten with the default of 3. [PR #101](https://github.com/metalfurius/gym/pull/101).                                                                                                                                                                                   |
| Done   | Numeric input correctness                      | Decimal weights are preserved; repetitions require whole numbers. Comma/dot input and strength/cardio form validation have regression coverage. [Fix](https://github.com/metalfurius/gym/commit/8ba3d20).                                                                                                                                                                                                                                             |
| Done   | Progress charts, statistics, and accessibility | Best-record and trend statistics, period filters, and a text/table chart alternative are delivered. [Fix](https://github.com/metalfurius/gym/commit/2d63198). Further data correctness work remains in priority 2 below.                                                                                                                                                                                                                              |
| Done   | Routine export/import                          | JSON clipboard export and validated import into the signed-in account, including batched writes and import status. Imports create copies and require a connection; workout history is not included. [PR #98](https://github.com/metalfurius/gym/pull/98).                                                                                                                                                                                             |
| Done   | PWA update implementation                      | Release revisions, asset hashes, verified service-worker installation, cache-busting update requests, session preservation, and offline restart. CDN-transformed HTML is checked by revision while other assets retain hash verification. [PR #79](https://github.com/metalfurius/gym/pull/79), [#99](https://github.com/metalfurius/gym/pull/99), [#100](https://github.com/metalfurius/gym/pull/100). Operational cache purging remains priority 1. |
| Done   | Local-first foundations and quality tooling    | Per-user caching for several data paths, Firebase usage telemetry, documented Firestore compatibility, offline replay tests, no-skipped-tests enforcement, coverage ratchet, and browser smoke scripts. The full Daily Hub v1.1 optimization is still partial.                                                                                                                                                                                        |

## Next Improvements, in Priority Order

Implementation plans and criterion IDs for all seven active objectives are in
[the execution index](docs/roadmap/README.md). Each implementation PR must receive two independent
**GPT-6.1-Sol xhigh** approvals of its identical final head before merge. A prerequisite merge does not
close an objective whose required operational/device evidence is still outstanding.

P0 addresses the observed production problem. P1 protects correctness and maintainability before expanding the product.
P2 adds training value and reduces the cost of future changes. Within a priority, follow the order below.
No calendar dates are committed until the preceding completion conditions are met.

| Order | Priority | Improvement                                                      | State                           | Completion condition                                                                                                     |
| ----- | -------- | ---------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | P0       | Reliable production cache delivery                               | Next; account access dependency | Purge and canonical production verification both pass for a deployed revision, with preserved installed-client workouts. |
| 2     | P1       | History, progress, and sync correctness                          | Planned verification and fixes  | Cross-view, account-switch, date-boundary, and reconnect scenarios produce the same saved data and metrics.              |
| 3     | P1       | Complete read-optimized weekly consistency v1.1                  | Partial / local                 | Measurably fewer Firestore reads, persistent per-user Daily Hub cache, and no correctness regression.                    |
| 4     | P1       | Maintain dependencies and make quality checks reproducible       | Planned; #67 and #70 open       | Current compatible dependency updates pass, documented commands match `main`, and browser checks are reproducible.       |
| 5     | P2       | Portable workout-history backup                                  | New; planned                    | A user can export a complete, versioned copy of their own saved workouts with clear completeness information.            |
| 6     | P2       | Correct saved workouts without recreating them                   | New; planned                    | A correction keeps the session ID/date, validates values, and refreshes affected views without duplicate sessions.       |
| 7     | P2       | Separate dashboard, Quick Log, and weekly state responsibilities | Planned                         | Smaller modules retain existing behavior, compatibility fields, offline ordering, and measured read ceilings.            |

### 1. Reliable Production Cache Delivery

Repair the Cloudflare credential/account configuration used by `Purge and Verify Canonical Cache` and verify the
Gym cache policy. This requires access to the relevant Cloudflare account; a successful Pages deployment alone
does not resolve the observed cache failure.

Done when the existing purge workflow succeeds and the public shell, metadata, worker, and cached assets agree
on the same revision on repeated requests without query parameters. Also verify an already-installed client
updates and restarts offline without losing its in-progress workout. Keep the existing stale-CDN recovery path.

### 2. History, Progress, and Sync Correctness

Extend regression coverage around rapid exercise/period switching, save/delete followed by dashboard/calendar/
history/progress refresh, account changes, and simultaneous or delayed preference writes from two devices.
Use a consistent test clock for week rollover, Sunday/Monday, timezone, and daylight-saving boundaries.
These are verification targets; only reproducible failures should be reported as confirmed bugs.

Done when outdated asynchronous results cannot replace the latest selection, caches do not leak between users,
and reconnect/reload preserves the latest valid target and saved sessions. A truncated history must not be
presented as complete or frozen into an incorrect historical result. Preserve the session-counting contract
already delivered in #97; this work must not revert it to distinct-day counting.

### 3. Complete Read-Optimized Weekly Consistency v1.1

Keep the shipped bounded 52-week query, short-lived memory cache, and offline replay behavior. Port and finish
the useful local changes rather than treating their presence on a branch as delivery. Reuse fresh results,
including empty results, persist the dashboard snapshot per user, invalidate on mutations, and avoid duplicate
reads during navigation or simultaneous refreshes. [Detailed plan](docs/read-optimized-weekly-consistency-plan.md).

Done when deterministic tests record read counts before/after repeated navigation and show zero extra session
reads while the snapshot is fresh. Expiry, explicit refresh, save/delete, account changes, and offline cold start
must still work, and high-volume/truncated results must not corrupt historical outcomes.

### 4. Dependencies and Reproducible Quality Checks

Re-evaluate #67 and #70 against current `main`; split incompatible major upgrades from routine maintenance.
Address deprecated action runtimes without changing application behavior in the same PR. Align the README,
testing/contribution policy, versioning documentation, and executable scripts before claiming additional gates
are enforced. The local `merge-ready` proposal and repository-wide blocking formatting are not delivered policy.

Chromium upgrade coverage already runs in CI. Reuse the existing Firefox upgrade, numeric-input, and
session-counting smoke scripts; make their execution and evidence reproducible, adding appropriate CI jobs.
Add a focused mobile Safari/iOS installed-PWA check, initially manual if necessary. Keep coverage at or above
70% and prioritize regression cases over increasing the percentage for its own sake.

### 5. Portable Workout-History Backup

Routine sharing already exists. Start with a versioned JSON export of the signed-in user's persisted sessions,
routine definitions, and weekly preferences. Exclude credentials and other accounts, preserve legacy-compatible
values, and show record counts plus whether the export is complete or limited to locally available data.

Done when exported values and counts match saved records, including decimal weights and execution variants,
and a documented restore design has validation, preview, and duplicate-handling rules. Implement restoration
as a separate reviewed step after export fidelity is established; do not imply the existing routine import
restores workout history.

### 6. Correct Saved Workouts Without Recreating Them

History currently offers viewing and deletion. Add a focused edit flow for a saved workout's label, notes,
weights, repetitions, and durations so a recording error does not require deleting and recreating the session.
Keep session identity and training date unchanged in the first version; changing historical dates needs a
separate decision about frozen weekly outcomes. Depend on the cache/invalidation work in priority 2.

Done when the editor validates the same values as session capture, preserves execution/load variants and
compatibility fields, and refreshes history, progress, and dashboard without duplicating a session. An edit
must survive reload and reconnection; define conflict handling before enabling concurrent/offline edits.
Provide ES/EN copy and keyboard-accessible validation. Existing best-record/trend statistics and suggestions
are already delivered and are not a new feature to build again.

### 7. Smaller Modules

Move Quick Log parsing, Daily Hub assembly, weekly calculations, and preference persistence out of the main
application orchestrator into explicit modules. Preserve the Firestore and queue contracts, including the
legacy field aliases. Keep this refactor separate from product behavior changes and update the PWA asset manifest
when modules change. Measure against the read budget established in priority 3.

## Deferred or Retired Work

- **Retired:** the March-May six-week schedule, expired weekly coverage steps, and fixed 45/35/20 allocation.
  The quality floor is now 70%; use the ordered backlog instead of reopening an elapsed cycle.
- **Retired as new features:** Quick Log, weekly streaks, language switching, routine import, best-record/trend
  statistics, previous-workout suggestions, accessible chart alternatives, and the recent numeric/target fixes.
  Their follow-ups belong to the specific items above.
- **Reclassified:** cross-browser testing is partly implemented, not wholly deferred. The remaining work is
  CI integration and real mobile coverage. PWA update code is shipped; operational cache delivery is not closed.
- **Deferred:** optional personal challenges until the core flow is reliable and a concrete user need is defined.
  Social sharing, leaderboards, and competitive mechanics have no implementation commitment.
- **Deferred:** nutrition and broader body-composition/goal schemas. Reconsider only with a concrete use case,
  data contract, and migration plan. Existing bodyweight load support is already delivered.

## Delivery and Roadmap Maintenance

For behavior changes, keep lint and CodeQL green, add relevant app/offline regression coverage, avoid skipped
tests, and meet the 70% statements threshold. Changes to cached assets must pass release-integrity checks;
release validation must distinguish CI success, deployment success, and public/installed-client verification.
If a correctness or release check fails, prioritize diagnosis and recovery over expanding product scope.

On each merged milestone, update this file and the README summary, link the merged PR/release evidence, and
remove that item from the active queue. Record outstanding operational failures separately from delivered code.
Keep detailed feature specifications as references; this file owns priority and shipped/pending status.
